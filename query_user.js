import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  const docRef = doc(db, 'users', 'QWefsZmnxKZKslpi8PsWPCv1LEv1');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    console.log("User data:", JSON.stringify(snap.data(), null, 2));
  } else {
    console.log("User does not exist");
  }
}
main().catch(console.error).then(() => process.exit(0));
