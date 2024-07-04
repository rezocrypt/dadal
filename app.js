const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const port = 3000; // Replace with your desired port number

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(bodyParser.urlencoded({ extended: true }));

// Parse JSON bodies (as sent by API clients)
app.use(bodyParser.json());

// Handle POST requests to the root URL
app.post('/', (req, res) => {
  console.log('Received POST data:', req.body);
  res.send('POST request received'); // Send a response back
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

