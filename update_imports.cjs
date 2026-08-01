const fs = require('fs');

let file = fs.readFileSync('src/pages/Settings.tsx', 'utf8');
file = file.replace("import { doc, getDoc, updateDoc } from 'firebase/firestore';", "import { doc, getDoc, updateDoc, collection, getDocs, writeBatch } from 'firebase/firestore';");
fs.writeFileSync('src/pages/Settings.tsx', file);
