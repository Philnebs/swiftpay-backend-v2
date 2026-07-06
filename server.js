import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose"; // ADDED
import bcrypt from "bcrypt"; // ADDED
import fetch from "node-fetch"; // ADDED for Flutterwave API
const app = express();

// 1. CONNECT TO MONGODB - ADD YOUR MONGO URL IN .env
mongoose.connect(process.env.MONGO_URL).then(() => console.log("MongoDB Connected"));

// USER MODEL - ADDED
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  password: String,
  accountNumber: String,
  accountBank: String,
  balance: { type: Number, default: 0 }
});
const User = mongoose.model("User", UserSchema);


// IMPORTANT: Webhook must come BEFORE express.json and use raw
app.use('/api/webhook/flutterwave', express.raw({type: 'application/json'}));
app.use(express.json());


app.get("/api/debug", (req, res) => {
  res.json({
    hasPublicKey: !!process.env.FLW_PUBLIC_KEY,
    hasSecretKey: !!process.env.FLW_SECRET_KEY,
    hasSecretHash: !!process.env.FLW_SECRET_HASH
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 3. NEW: SIGNUP ROUTE - THIS CREATES USER + VIRTUAL ACCOUNT
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    // CALL FLUTTERWAVE TO CREATE VIRTUAL ACCOUNT
    const flwResponse = await fetch("https://api.flutterwave.com/v3/virtual-account-numbers", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.FLW_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: email,
        bvn: "00000", // Use a test BVN or remove for sandbox
        phonenumber: phone,
        firstname: name.split(' ')[0],
        lastname: name.split(' ').slice(1).join(' ') || name.split(' ')[0],
        narration: "SwiftPay Wallet"
      })
    });
    const flwData = await flwResponse.json();

    if(flwData.status !== "success") return res.status(400).json({error: flwData.message});

    const newUser = new User({
      name, email, phone, password: hashedPassword,
      accountNumber: flwData.data.account_number,
      accountBank: flwData.data.bank_name,
      balance: 0
    });
    await newUser.save();

    res.status(201).json({ 
      status: "success",
      message: "User created", 
      accountNumber: flwData.data.account_number,
      bankName: flwData.data.bank_name,
      user: newUser
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Signup failed" });
  }
});

// 4. NEW: LOGIN ROUTE
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
      user: { id: user._id, name: user.name, accountNumber: user.accountNumber, accountBank: user.accountBank, balance: user.balance }
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});


app.get("/api/banks", (req, res) => {
  res.json({ 
    status: "success", 
    data: [
      { name: "GTBank", code: "058" },
      { name: "Access Bank", code: "044" },
      { name: "First Bank", code: "011" }
    ]
  });
});

// YOUR EXISTING FUND WALLET CODE... REMAINS THE SAME
app.post('/api/fund-wallet', async (req, res) => { ... });

// YOUR EXISTING WEBHOOK CODE... BUT NOW IT UPDATES DB
app.post('/api/webhook/flutterwave', async (req, res) => {
  const secretHash = process.env.FLW_SECRET_HASH;
  const signature = req.headers["verif-hash"];

  if (!signature || signature !== secretHash) {
    return res.status(401).json({error: "Unauthorized"});
  }

  const payload = JSON.parse(req.body.toString());

  if (payload.event === "charge.completed" && payload.data.status === "successful") {
    const { tx_ref, amount } = payload.data;
    const userId = tx_ref.split('-')[1];
    
    await User.findByIdAndUpdate(userId, { $inc: { balance: amount } }); // NOW IT ACTUALLY CREDITS
    console.log(`✅ Credited ${amount} to user ${userId}`);
  }

  res.status(200).send("OK");
});

app.post("/api/resolve-account", (req, res) => { ... });
app.post("/api/transfer", (req, res) => { ... });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
