import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const secret = process.env.JWT_SECRET_KEY;

export const generateToken = (payload, expiresIn = '7d') => {
  return jwt.sign(payload, secret, { expiresIn });
};
