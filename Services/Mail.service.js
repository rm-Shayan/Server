import nodemailer from "nodemailer";
import {  generateEmailTemplate } from "../Utilities/mail.js";

const otpStore = new Map();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Generic send mail
export const sendMail = async ({ to, subject, html }) => {
  if (!to) throw new Error("Recipient email is required");
  return transporter.sendMail({
    from: `"My Chat App" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html
  });
};

;


// Send Welcome Email
export const sendWelcomeToUser = async (user) => {
  
  const htmlUser = generateEmailTemplate({
    title: `Hello ${user.name} 👋`,
    message: `Welcome to our chat application. Start connecting with your friends!`,
    buttonText: "Get Started",
    buttonUrl: !process.env.FRONTENED_URL||`http://localhost:5173`,
    logoUrl: "../Public/logo.png"
  });

  await sendMail({ to: user.email, subject: "Welcome to My Chat App!", html: htmlUser });

  const htmlAdmin = generateEmailTemplate({
    title: `New User Signed Up: ${user.name}`,
    message: `User <strong>${user.name}</strong> (${user.email}) just signed up.`,
    logoUrl: "../Public/logo.png"
  });

  await sendMail({ to: process.env.ADMIN_EMAIL, subject: `New Signup: ${user.name}`, html: htmlAdmin });
};

// Send OTP Email
export const sendOTPToUser = async (user, otp) => {
  const html = generateEmailTemplate({
    title: `Your OTP for My Chat App`,
    message: `Hello ${user.name},<br>Your OTP is: <strong>${otp}</strong><br>This OTP will expire in ${process.env.OTP_EXPIRE_MIN} minute(s).`,
    logoUrl: "../Public/logo.png"
  });

  await sendMail({ to: user.email, subject: "Your OTP for My Chat App", html });
};

// Send Update / Notification
export const sendUpdateToUser = async ({ user, updateText }) => {
  const html = generateEmailTemplate({
    title: "Notification from My Chat App",
    message: updateText,
    logoUrl: "../Public/logo.png"
  });

  await sendMail({ to: user.email, subject: "Notification from My Chat App", html });
};

// Send Feedback / Contact to Admin
export const sendFeedbackToAdmin = async ({ user, feedback }) => {
  const html = generateEmailTemplate({
    title: `Feedback from ${user.name}`,
    message: `User <strong>${user.name}</strong> (${user.email}) sent feedback:<br>${feedback}`,
    logoUrl: "../Public/logo.png"
  });

  await sendMail({ to: process.env.ADMIN_EMAIL, subject: `Feedback from ${user.name}`, html });
};
