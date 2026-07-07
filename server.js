import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

// 1. CONNECT TO MONGODB
console.log("MONGO URI:", process.env.MONGO_URL)
mongoose.connect(process.env.MONGO_URL)
 .then(() => console.log("MongoDB Connected"))
 .catch(err => console.log(err))

// USER MODEL - ADDED bvn
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  bvn: { type: String, unique: true }, // ADDED
  password: String,
  accountNumber: String,
  accountBank: String,
  balance: { type: Number, default: 0 },
  transactionPin: { type: String, default: null }
});
const User = mongoose.model("User", UserSchema);

// IMPORTANT: Webhook must come BEFORE express.json and use raw
app.use('/api/webhook/flutterwave', express.raw({type: 'application/json'}));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "SwiftPay API is Running 🚀" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 2. SIGNUP ROUTE - BYPASS FLUTTERWAVE FOR TESTING
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, phone, password, bvn, transactionPin } = req.body;

    if (!name ||!email ||!phone ||!password ||!bvn ||!transactionPin) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (bvn.length!== 11 || isNaN(bvn)) {
      return res.status(400).json({ error: "BVN must be 11 digits" });
    }
    if (transactionPin.length!== 4 || isNaN(transactionPin)) {
      return res.status(400).json({ error: "PIN must be 4 digits" });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }, { bvn }] });
    if (existingUser) return res.status(400).json({ error: "User already exists" });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedPin = await bcrypt.hash(transactionPin, 10);

    // GENERATE FAKE ACCOUNT NUMBER FOR TESTING
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
      status: "success", 
      message: "Account created successfully", 
      accountNumber: accountNumber, 
      bankName: "SwiftPay Test Bank",
      balance: 5000
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Signup failed" });
  }
});
    if (existingUser) return res.status(400).json({ error: "User with email, phone or BVN already exists" });
    
    // HASH PASSWORD AND PIN
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedPin = await bcrypt.hash(transactionPin, 10);

    // CREATE FLUTTERWAVE VIRTUAL ACCOUNT WITH REAL BVN
    const flwResponse = await fetch("https://api.flutterwave.com/v3/virtual-account-numbers", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.FLW_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ 
        email: email, 
        bvn: bvn, // SEND REAL BVN NOW
        phonenumber: phone, 
        firstname: name.split(' ')[0], 
        lastname: name.split(' ').slice(1).join(' ') || name.split(' ')[0], 
        narration: "SwiftPay Wallet" 
      })
    });
    const flwData = await flwResponse.json();
    if(flwData.status!== "success") return res.status(400).json({error: flwData.message});

    // SAVE USER
    const newUser = new User({ 
      name, 
      email, 
      phone, 
      bvn, // SAVE BVN
      password: hashedPassword, 
      transactionPin: hashedPin, // SAVE PIN
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
      user: {
        id: newUser._id, 
        name, 
        email, 
        accountNumber: newUser.accountNumber
      } 
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Signup failed" });
  }
});

// 3. LOGIN ROUTE
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });
    res.status(200).json({ status: "success", message: "Login successful", user: { id: user._id, name: user.name, accountNumber: user.accountNumber, accountBank: user.accountBank, balance: user.balance } });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

// 4. SET TRANSACTION PIN - CAN DELETE THIS NOW BECAUSE PIN IS SET ON SIGNUP
app.post('/api/set-pin', async (req, res) => {
  try {
    const { userId, pin } = req.body;
    if (pin.length!== 4) return res.status(400).json({ error: "PIN must be 4 digits" });
    const hashedPin = await bcrypt.hash(pin, 10);
    await User.findByIdAndUpdate(userId, { transactionPin: hashedPin });
    res.json({ status: "success", message: "Transaction PIN set successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to set PIN" });
  }
});

// 5. FORGOT PASSWORD - NEW
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(user._id, { password: hashedPassword });
    res.json({ status: "success", message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ error: "Password reset failed" });
  }
});

app.get("/api/banks", (req, res) => {
  res.json({ status: "success", data: [ { name: "GTBank", code: "058" }, { name: "Access Bank", code: "044" }, { name: "First Bank", code: "011" } ] });
});

// 6. FUND WALLET
app.post('/api/fund-wallet', async (req, res) => {
  try {
    const { userId, amount, email, name } = req.body;
    if (!userId ||!amount ||!email ||!name) { return res.status(400).json({ error: "Missing userId, amount, email, or name" }); }
    const tx_ref = `SWIFTPAY-${userId}-${Date.now()}`;
    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.FLW_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tx_ref: tx_ref, amount: amount, currency: "NGN", redirect_url: "https://swiftpay.onrender.com/payment-success", payment_options: "card, banktransfer, ussd", customer: { email: email, name: name, phone_number: "08000000" }, customizations: { title: "Fund SwiftPay Wallet", description: "Add money to your SwiftPay wallet", logo: "https://your-logo-url.com/logo.png" } })
    });
    const data = await response.json();
    if (data.status === "success") { res.json({ status: "success", link: data.data.link }); } 
    else { res.status(400).json({ error: data.message }); }
  } catch (error) { console.log(error); res.status(500).json({ error: "Payment initiation failed" }); }
});

// 7. WEBHOOK - CREDIT WALLET
app.post('/api/webhook/flutterwave', async (req, res) => {
  const secretHash = process.env.FLW_SECRET_HASH;
  const signature = req.headers["verif-hash"];
  if (!signature || signature!== secretHash) { return res.status(401).json({error: "Unauthorized"}); }
  const payload = JSON.parse(req.body.toString());
  if (payload.event === "charge.completed" && payload.data.status === "successful") {
    const { tx_ref, amount } = payload.data;
    const userId = tx_ref.split('-')[1];
    await User.findByIdAndUpdate(userId, { $inc: { balance: amount } });
    console.log(`Credited ${amount} to user ${userId}`);
  }
  res.status(200).send("OK");
});

// 8. RESOLVE ACCOUNT
app.post("/api/resolve-account", async (req, res) => {
  const { accountNumber, bankCode } = req.body;
  const response = await fetch(`https://api.flutterwave.com/v3/accounts/resolve`, {
    method: "POST", headers: { "Authorization": `Bearer ${process.env.FLW_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode })
  });
  const data = await response.json();
  res.json(data);
});

// 9. TRANSFER - UPDATED WITH PIN CHECK + BALANCE DEDUCTION
app.post("/api/transfer", async (req, res) => {
  try {
    const { userId, amount, bankCode, accountNumber, accountName, pin } = req.body;
    
    const user = await User.findById(userId);
    if(!user) return res.status(400).json({ error: "User not found" });
    if(user.balance < amount) return res.status(400).json({ error: "Insufficient balance" });
    if(!user.transactionPin) return res.status(400).json({ error: "Please set transaction PIN first" });
    
    const isPinMatch = await bcrypt.compare(pin, user.transactionPin);
    if(!isPinMatch) return res.status(400).json({ error: "Invalid Transaction PIN" });

    // TODO: Call Flutterwave Transfer API here
    // For now we just deduct balance
    await User.findByIdAndUpdate(userId, { $inc: { balance: -amount } });
    
    res.json({ status: "success", message: `Transfer of ₦${amount} to ${accountName} successful`, reference: "SP" + Date.now(), newBalance: user.balance - amount });
  } catch (error) {
    res.status(500).json({ error: "Transfer failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
