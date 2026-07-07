import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  bvn: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  transactionPin: { type: String, required: true },
  accountNumber: { type: String, required: true, unique: true },
  accountBank: { type: String, default: "SwiftPay Test Bank" },
  balance: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
