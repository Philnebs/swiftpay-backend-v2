import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import User from './models/User.js'; // ADD .js HERE IMPORTANT

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// 1. CONNECT TO MONGODB
mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// 2. HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 3. SIGNUP ROUTE - BYPASS FLUTTERWAVE
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, phone, password, bvn, transactionPin } = req.body;

    if (!name ||!email ||!phone ||!password ||!bvn ||!transactionPin) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (bvn.length !== 11 || isNaN(bvn)) {
      return res.status(400).json({ error: "BVN must be 11 digits" });
    }
    if (transactionPin.length !== 4 || isNaN(transactionPin)) {
      return res.status(400).json({ error: "PIN must be 4 digits" });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }, { bvn }] });
    if (existingUser) return res.status(400).json({ error: "User already exists" });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedPin = await bcrypt.hash(transactionPin, 10);

    let accountNumber;
    do {
      accountNumber = Math.floor(1000000 + Math.random() * 9000000).toString();
    } while (await User.findOne({ accountNumber }));

    const newUser = new User({ 
      name, email, phone, bvn,
      password: hashedPassword, 
      transactionPin: hashedPin,
      accountNumber: accountNumber,
      accountBank: "SwiftPay Test Bank",
      balance: 5000
    });
    await newUser.save();
    
  res.status(201).json({
  id: newUser._id, // <-- ADD THIS LINE
  status: "success",
  message: "Account created successfully",
  accountNumber: accountNumber,
  bankName: "SwiftPay Test Bank",
  balance: 5000
})

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Signup failed" });
  }
});

// 4. LOGIN ROUTE
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    res.status(200).json({ 
      status: "success", 
      message: "Login successful", 
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email,
        accountNumber: user.accountNumber,
        accountBank: user.accountBank,
        balance: user.balance
      } 
    });

  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
