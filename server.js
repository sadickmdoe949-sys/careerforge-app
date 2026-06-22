require('dotenv').config(); 
const express = require('express'); 
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs'); 
const path = require('path'); 
const PDFDocument = require('pdfkit'); 
const cloudinary = require('cloudinary').v2; 
const { GoogleGenAI } = require('@google/genai'); // NIMEONGEZA GEMINI AI SDK

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// --- MIPANGILIO YA CLOUDINARY ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- MIPANGILIO YA GEMINI AI ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- KUUNGANISHA NA DATABASE ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cv_pro_db';
mongoose.connect(MONGO_URI)
.then(() => console.log('✅ MongoDB Imekubali!'))
.catch(err => console.error('❌ DB Error:', err));

// --- SCHEMAS ---
const DocumentSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    title: { type: String, required: true },
    type: { type: String, required: true }, // ATS, Academic, Executive, au Cover Letter
    date: { type: String, required: true },
    fileUrl: { type: String, required: true }
});
const Document = mongoose.model('Document', DocumentSchema);

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// === ROUTES ===
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/documents', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ message: 'userId inahitajika!' });
        const docs = await Document.find({ userId });
        res.json(docs);
    } catch (error) {
        res.status(500).json({ message: 'Hitilafu kupata nyaraka.', error });
    }
});

// --- REGISTER & LOGIN ROUTES (Zile zile thabiti) ---
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: 'Email tayari imesajiliwa!' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ fullName, email, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: 'Akaunti tayari!', userId: newUser._id, fullName: newUser.fullName });
    } catch (error) { res.status(500).json({ message: 'Error.', error }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: 'Email au Password si sahihi!' });
        }
        res.json({ message: 'Umeingia!', userId: user._id, fullName: user.fullName });
    } catch (error) { res.status(500).json({ message: 'Error.', error }); }
});


// --- 🔥 NJIA MPYA YA KI-PRO: AI-POWERED GENERATION ---
app.post('/api/generate-pdf', async (req, res) => {
    try {
        const { userId, fullName, email, phone, skills, experience, type } = req.body;

        if (!fullName || !email) {
            return res.status(400).json({ message: 'Jaza Jina na Email tafadhali.' });
        }

        const docType = type || 'ATS'; // Aina ya muundo: ATS, Academic, Executive, Cover Letter

        // 1. KUTENGENEZA PROMPT KULINGANA NA AINA YA CV / BARUA
        let aiPrompt = `Ushauri wa Kitaalamu: Mimi ni mtaalamu wa kuandika wasifu (CV) na barua za maombi ya kazi. 
        Mteja wangu anaitwa ${fullName}, mwenye ujuzi wa: [${skills}] na uzoefu wa: [${experience}].
        
        Tengeneza maudhui ya kitaalamu kwa lugha ya Kiingereza (au Kiswahili kama kimeandikwa kwa Kiswahili) kulingana na aina hii ya muundo: "${docType}".`;

        if (docType === 'ATS') {
            aiPrompt += `\nMuundo uwe ATS-Friendly. Tumia 'High-Impact Action Verbs'. Weka sehemu ya Summary, Professional Experience, na Skills kwa muundo safi wa vitone (bullet points) unaosomeka kwa urahisi na mifumo ya skana ya makampuni.`;
        } else if (docType === 'Executive') {
            aiPrompt += `\nMuundo uwe wa Ki-Kiongozi (Executive). Lugha iwe ya ngazi ya juu (Leadership tone), inayoangazia mikakati, matokeo ya biashara, na usimamizi (Management & ROI).`;
        } else if (docType === 'Academic') {
            aiPrompt += `\nMuundo uwe wa Kiakademia (CV/Resume). Angazia utafiti, machapisho, mafunzo, na historia ya kielimu kwa undani zaidi.`;
        } else if (docType === 'Cover Letter') {
            aiPrompt += `\nTengeneza Barua ya Maombi ya Kazi (Cover Letter) ya kiwango cha juu ikionyesha jinsi uzoefu na ujuzi wake unavyotatua changamoto za mwajiri. Iwe na muundo rasmi wa barua.`;
        }

        aiPrompt += `\n\nRudisha majibu yakiwa yamepangwa vizuri tayari kwa kuchapishwa kwenye PDF moja kwa moja.`;

        // 2. TUMA KWA GEMINI AI IKANEECHEZEE KAZI
        console.log(`🤖 AI inatengeneza muundo wa: ${docType}...`);
        const aiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: aiPrompt,
        });
        const professionalContent = aiResponse.text;

        // 3. ANDAA PDF KIT
        const doc = new PDFDocument({ margin: 50 });
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        
        doc.on('end', async () => {
            try {
                let pdfBuffer = Buffer.concat(buffers);

                if (userId) {
                    const base64PDF = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
                    const titleName = `${fullName.replace(/\s+/g, '_')}_${docType}.pdf`;
                    const dateToday = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                    const uploadResponse = await cloudinary.uploader.upload(base64PDF, {
                        folder: 'careerforge_cvs',
                        resource_type: 'raw',
                        public_id: `${userId}_${Date.now()}.pdf`
                    });

                    const newDoc = new Document({
                        userId: userId,
                        title: titleName,
                        type: docType,
                        date: dateToday,
                        fileUrl: uploadResponse.secure_url
                    });
                    await newDoc.save();
                }

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=${fullName.replace(/\s+/g, '_')}_${docType}.pdf`);
                res.send(pdfBuffer);

            } catch (err) {
                console.error('❌ Cloudinary/DB Error:', err);
                if (!res.headersSent) res.status(500).json({ message: 'Hitilafu ya kuhifadhi.' });
            }
        });

        // 4. CHORA MAUDHUI YA KI-PRO NDANI YA PDF
        // Header
        doc.fontSize(22).fillColor('#07224f').text(fullName, { align: 'center' });
        doc.fontSize(10).fillColor('#64748b').text(`Email: ${email} | Phone: ${phone || 'N/A'}`, { align: 'center' });
        doc.moveDown(1);
        
        // Line ya urembo wa ki-Executive
        doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#cbd5e1').stroke();
        doc.moveDown(1.5);

        // Mwili mzima uliosafishwa na AI
        doc.fontSize(11).fillColor('#1e293b').text(professionalContent, {
            align: 'left',
            lineGap: 4
        });

        doc.end();

    } catch (error) {
        console.error('❌ Server Error:', error);
        if (!res.headersSent) res.status(500).json({ message: 'Hitilafu imetokea.', error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server ipo hewani kwenye Port: ${PORT}`));