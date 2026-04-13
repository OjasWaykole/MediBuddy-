const express = require("express");
const router = express.Router();

// Example route
router.post("/pay", (req, res) => {
  res.json({ message: "Payment recorded successfully" });
});

module.exports = router;
