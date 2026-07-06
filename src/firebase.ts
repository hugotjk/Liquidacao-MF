import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCmUO7RKJ1dkzTFknyujb1Ydzam9oDIuxM",
  authDomain: "poised-grin-8tgzl.firebaseapp.com",
  projectId: "poised-grin-8tgzl",
  storageBucket: "poised-grin-8tgzl.firebasestorage.app",
  messagingSenderId: "151986359434",
  appId: "1:151986359434:web:c658d1531e2c2dfe2bf173"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the specific database ID
export const db = getFirestore(app, "ai-studio-consultadepreos-e83f3d7f-9859-4a50-8a49-163d0eeb504a");

import { doc, getDocFromServer } from "firebase/firestore";

async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
