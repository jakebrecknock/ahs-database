
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDoyydB87tBiMSL0eZGM-NpQzRBN15VA4o",
  authDomain: "ahs-estimator.firebaseapp.com",
  projectId: "ahs-estimator",
  storageBucket: "ahs-estimator.appspot.com",
  messagingSenderId: "723655852711",
  appId: "1:723655852711:web:3b70af6452bb1d48229182",
  measurementId: "G-H8FMF351J8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
