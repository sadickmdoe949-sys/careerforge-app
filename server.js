const express = require('express'); 
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Inatumia bcryptjs
const path = require('path'); 

const app = express();
app.use(express.json());
app.use(cors());

// --- KUUNGANISHA NA DATABASE ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cv_pro_db';

mongoose.connect(MONGO_URI)
.then(() => console.log('✅ Umefanikiwa kuunganisha na Database ya MongoDB!'))
.catch(err => console.error('❌ Hitilafu ya kuunganisha Database:', err));

// --- MUUNDO WA TAARIFA (User Schema) ---
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    documents: [{ title: String, type: String, date: String }]
});

const User = mongoose.model('User', userSchema);

// === NJIA KUU ===
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- NJIA YA KUJISAJILI (Salama na Hashing) ---
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: 'Email hii tayari imeshasajiliwa!' });

        // Kufunga password kwa usalama kabla ya kwenda kwenye Database
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({ fullName, email, password: hashedPassword, documents: [] });
        await newUser.save();

        res.status(201).json({ message: 'Akaunti imetengenezwa kwa ufanisi!', userId: newUser._id, fullName: newUser.fullName });
    } catch (error) {
        res.status(500).json({ message: 'Hitilafu imetokea upande wa server.', error });
    }
});

// --- NJIA YA KUINGIA (Inalinganisha kwa Usalama) ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Email au Password si sahihi!' });

        // Kulinganisha password iliyoandikwa na ile iliyofungwa kwenye Database
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Email au Password si sahihi!' });

        res.json({ 
            message: 'Umeingia kwa mafanikio!', 
            userId: user._id, 
            fullName: user.fullName,
            documents: user.documents 
        });
    } catch (error) {
        res.status(500).json({ message: 'Hitilafu imetokea.', error });
    }
});

// --- WASHA SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server inafanya kazi kwenye Port: ${PORT}`);
});