import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { User } from '../models/user.js';

function createToken(user: User): string {
  return jwt.sign({ sub: user.id, email: user.email }, env.jwtSecret, { expiresIn: '7d' });
}

function userResponse(user: User) {
  return { id: user.id, organizationId: user.organizationId, email: user.email };
}

export async function signup(request: Request, response: Response): Promise<void> {
  const { organizationId, email, password } = request.body as Record<string, unknown>;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!Number.isInteger(organizationId) || (organizationId as number) <= 0) {
    response.status(400).json({ message: 'A valid organizationId is required' });
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    response.status(400).json({ message: 'A valid email is required' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    response.status(400).json({ message: 'Password must be at least 8 characters' });
    return;
  }

  const existingUser = await User.findOne({ where: { email: normalizedEmail } });
  if (existingUser) {
    response.status(409).json({ message: 'An account with this email already exists' });
    return;
  }

  const organizationExists = await User.sequelize!.query(
    'SELECT 1 FROM organizations WHERE id = ? LIMIT 1',
    { replacements: [organizationId] },
  );
  if (organizationExists[0].length === 0) {
    response.status(400).json({ message: 'The organization does not exist' });
    return;
  }

  const user = await User.create({
    organizationId: organizationId as number,
    email: normalizedEmail,
    password: await bcrypt.hash(password, 12),
  });

  response.status(201).json({ user: userResponse(user), token: createToken(user) });
}

export async function signin(request: Request, response: Response): Promise<void> {
  const { email, password } = request.body as Record<string, unknown>;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedEmail || typeof password !== 'string' || !password) {
    response.status(400).json({ message: 'Email and password are required' });
    return;
  }

  const user = await User.findOne({ where: { email: normalizedEmail } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    response.status(401).json({ message: 'Invalid email or password' });
    return;
  }

  response.json({ user: userResponse(user), token: createToken(user) });
}
