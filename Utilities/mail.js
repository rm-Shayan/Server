
import crypto from "crypto";

// 1️⃣ Welcome Email


// 2️⃣ Generate & Send OTP


export const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString(); // 6-digit OTP
};



// 3️⃣ Send Update / Notification to User


const otpStore = new Map(); // temporary storage, can be replaced with DB or Redis


export const generateEmailTemplate = ({ title, message, buttonText, buttonUrl, logoUrl }) => {
  // Default logo agar na diya ho
  const logo = logoUrl || "../Public/logo.png";

  // CSS as JS object
  const styles = {
    container: `
      width: 100%; 
      font-family: 'Poppins', sans-serif; 
      background-color: #f3f4f6; 
      padding: 2rem 0;
    `,
    card: `
      max-width: 600px; 
      margin: auto; 
      background: #fff; 
      border-radius: 12px; 
      padding: 2rem; 
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    `,
    logo: `
      display: block; 
      margin: 0 auto 1rem; 
      width: 120px;
    `,
    title: `
      font-size: 1.8rem; 
      font-weight: bold; 
      color: #1f2937; 
      text-align: center;
    `,
    message: `
      font-size: 1rem; 
      color: #4b5563; 
      margin: 1rem 0; 
      text-align: center;
    `,
    button: `
      display: inline-block; 
      background-color: #10b981; 
      color: #fff; 
      padding: 0.75rem 1.5rem; 
      border-radius: 8px; 
      text-decoration: none; 
      font-weight: 600;
      margin: 1rem auto; 
      text-align: center;
    `
  };

  return `
  <div style="${styles.container}">
    <div style="${styles.card}">
      <img src="${logo}" alt="Logo" style="${styles.logo}" />
      <h1 style="${styles.title}">${title}</h1>
      <p style="${styles.message}">${message}</p>
      ${buttonText && buttonUrl ? `<a href="${buttonUrl}" style="${styles.button}">${buttonText}</a>` : ""}
    </div>
  </div>
  `;
};
