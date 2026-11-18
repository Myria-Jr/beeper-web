require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n  Beeper Web (iPad UI) running at http://localhost:${PORT}`);
  console.log(`  Beeper Desktop API target: ${process.env.BEEPER_API_URL || 'http://localhost:23373'}\n`);
});
