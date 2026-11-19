
const express = require("express");
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>LYX SYSTEM</title>
        <style>
          body {
            background: #080808;
            color: white;
            font-family: Arial;
            text-align: center;
            padding-top: 100px;
          }
          h1 { color: #a855f7; }
        </style>
      </head>
      <body>
        <h1>LYX SYSTEM</h1>
        <h2>Dashboard</h2>
        <p>Dashboard is running successfully.</p>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LYX Dashboard running on port ${PORT}`);
});
