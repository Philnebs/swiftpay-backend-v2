import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "SwiftPay V2 is running" });
});

app.get("/api/banks", (req, res) => {
  res.json({ 
    status: "success",
    banks: [
      { name: "GTBank", code: "058" },
      { name: "Access Bank", code: "044" },
      { name: "Zenith Bank", code: "057" },
      { name: "UBA", code: "033" },
      { name: "First Bank", code: "011" }
    ]
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
