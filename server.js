require('dotenv').config(); // LINAANZA HILI JUU KABISA ILI KUSOMA .ENV
const express = require('express'); 
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs'); 
const path = require('path'); 
const PDFDocument = require('pdfkit'); 
const cloudinary = require('cloudinary').v2; // NIMEONGEZA CLOUDINARY KWA CLOUD STORAGE

const app = express();

// Kuongeza limit ili kuruhusu data kubwa kama base64 kupita bila fujo
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// --- MIPANGILIO YA CLOUDINARY KUTOKA KWENYE .ENV ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- KUUNGANISHA NA DATABASE ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cv_pro_db';

mongoose.connect(MONGO_URI)
.then(() => console.log('✅ Umefanikiwa kuunganisha na Database ya MongoDB!'))
.catch(err => console.error('❌ Hitilafu ya kuunganisha Database:', err));

// --- MUUNDO WA DOCUMENT SCHEMA (Kwa ajili ya Maktaba ya Nyaraka) ---
const DocumentSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    title: { type: String, required: true },
    type: { type: String, required: true },
    date: { type: String, required: true },
    fileUrl: { type: String, required: true } // Link halisi ya Cloudinary itakaa hapa
});
const Document = mongoose.model('Document', DocumentSchema);

// --- MUUNDO WA USER SCHEMA ---
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// === NJIA KUU ===
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- NJIA YA KUPATA DOCUMENTS ZOTE ZA MTUMIAJI MMOJA ---
app.get('/api/documents', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ message: 'userId inahitajika!' });
        const docs = await Document.find({ userId });
        res.json(docs);
    } catch (error) {
        res.status(500).json({ message: 'Hitilafu imetokea kupata nyaraka.', error });
    }
});

// --- NJIA YA KUJISAJILI ---
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: 'Email hii tayari imeshasajiliwa!' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({ fullName, email, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: 'Akaunti imetengenezwa kwa ufanisi!', userId: newUser._id, fullName: newUser.fullName });
    } catch (error) {
        res.status(500).json({ message: 'Hitilafu imetokea upande wa server.', error });
    }
});

// --- NJIA YA KUINGIA ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Email au Password si sahihi!' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Email au Password si sahihi!' });

        res.json({ 
            message: 'Umeingia kwa mafanikio!', 
            userId: user._id, 
            fullName: user.fullName
        });
    } catch (error) {
        res.status(500).json({ message: 'Hitilafu imetokea.', error });
    }
});

// --- NJIA YA KUTENGENEZA PDF, KUSHUSHA, NA KUHIFADHI CLOUDINARY ---
app.post('/api/generate-pdf', async (req, res) => {
    try {
        const { userId, fullName, email, skills, experience, type } = req.body;

        if (!fullName || !email) {
            return res.status(400).json({ message: 'Tafadhali jaza Jina na Email ili kutengeneza PDF.' });
        }

        // 1. Tengeneza PDF kwa kutumia PDFKit kwenye Memory (Buffer)
        const doc = new PDFDocument({ margin: 50 });
        let buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        
        doc.on('end', async () => {
            let pdfBuffer = Buffer.concat(buffers);

            // A. Tuma PDF hiyo hiyo kwa Browser ya mtumiaji ili idownload hapo hapo
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=${fullName.replace(/\s+/g, '_')}_CV.pdf`);
            res.send(pdfBuffer);

            // B. Kama kuna userId, upload PDF kwenda Cloudinary na uhifadhi link MongoDB
            if (userId) {
                try {
                    const base64PDF = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
                    const docType = type || 'CV';
                    const titleName = docType === 'CV' ? `${fullName}_CV.pdf` : `${fullName}_Letter.pdf`;
                    const dateToday = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                    // Sukuma Cloudinary kama raw file (PDF)
                    const uploadResponse = await cloudinary.uploader.upload(base64PDF, {
                        folder: 'careerforge_cvs',
                        resource_type: 'raw',
                        public_id: `${userId}_${Date.now()}.pdf`
                    });

                    // Hifadhi kwenye MongoDB
                    const newDoc = new Document({
                        userId: userId,
                        title: titleName,
                        type: docType,
                        date: dateToday,
                        fileUrl: uploadResponse.secure_url
                    });
                    await newDoc.save();
                    console.log(`✅ Hati imehifadhiwa Cloudinary na DB kwa userId: ${userId}`);
                } catch (err) {
                    console.error('❌ Error ya kusukuma Cloudinary/DB:', err);
                }
            }
        });

        // --- MUONEKANO WA NDANI YA PDF ---
        doc.fontSize(24).fillColor('#07224f').text(fullName, { align: 'center' });
        doc.fontSize(10).fillColor('#64748b').text(`Email: ${email}`, { align: 'center' });
        doc.moveDown(2);

        doc.fontSize(16).fillColor('#07224f').text(type === 'Cover Letter' ? 'Mwili wa Barua (Letter Body)' : 'Uzoefu wa Kazi (Experience)', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).fillColor('#1e293b').text(experience || 'Hujajaza uzoefu bado.');
        doc.moveDown(1.5);

        if (type !== 'Cover Letter') {
            doc.fontSize(16).fillColor('#07224f').text('Ujuzi (Skills)', { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(12).fillColor('#1e293b').text(skills || 'Hujajaza ujuzi bado.');
        }

        doc.end();

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Hitilafu imetokea wakati wa kutengeneza PDF.', error });
    }
});

// --- WASHA SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server inafanya kazi kwenye Port: ${PORT}`);
});