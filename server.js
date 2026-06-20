const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(cors());

// 1. KUUNGANISHA NA DATABASE (Inasoma Atlas live, au Local isipopatikana)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cv_pro_db';

mongoose.connect(MONGO_URI)
.then(() => console.log('✅ Umefanikiwa kuunganisha na Database ya MongoDB!'))
.catch(err => console.error('❌ Hitilafu ya kuunganisha Database:', err));

// 2. KUTENGENEZA MUUNDO WA TAARIFA (User Schema)
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    documents: [{ title: String, type: String, date: String }]
});

const User = mongoose.model('User', userSchema);

// 3. NJIA YA KUJISAJILI (Register API Endpoint)
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: 'Email hii tayari imeshasajiliwa!' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({ fullName, email, password: hashedPassword, documents: [] });
        await newUser.save();

        res.status(201).json({ message: 'Akaunti imetengenezwa kwa ufanisi!', userId: newUser._id, fullName: newUser.fullName });
    } catch (error) {
        res.status(500).json({ message: 'Hitilafu imetokea upande wa server.', error });
    }
});

// 4. NJIA YA KUINGIA (Login API Endpoint)
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
            fullName: user.fullName,
            documents: user.documents 
        });
    } catch (error) {
        res.status(500).json({ message: 'Hitilafu imetokea.', error });
    }
});

// WASHA SERVER KUTUMIA PORT YA RENDER AU 5000 YA LOKALO
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server inafanya kazi kwenye Port: ${PORT}`);
});