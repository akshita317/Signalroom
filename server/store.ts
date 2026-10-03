import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Investigation, User } from './types.js'

const dataDir = path.resolve(process.cwd(), 'data')
const usersFile = path.join(dataDir, 'users.json')
const investigationsFile = path.join(dataDir, 'investigations.json')

type Database = { users: User[]; investigations: Investigation[] }

function readDatabase(): Database {
  fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]')
  if (!fs.existsSync(investigationsFile)) fs.writeFileSync(investigationsFile, '[]')
  return {
    users: JSON.parse(fs.readFileSync(usersFile, 'utf8')) as User[],
    investigations: JSON.parse(fs.readFileSync(investigationsFile, 'utf8')) as Investigation[],
  }
}

function writeDatabase(database: Database) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(usersFile, JSON.stringify(database.users, null, 2))
  fs.writeFileSync(investigationsFile, JSON.stringify(database.investigations, null, 2))
}

export async function createUser(name: string, email: string, password: string) {
  const database = readDatabase()
  if (database.users.some((user) => user.email === email.toLowerCase())) throw new Error('An account with this email already exists')
  const user: User = { id: crypto.randomUUID(), name, email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12), createdAt: new Date().toISOString() }
  database.users.push(user)
  writeDatabase(database)
  return user
}

export async function verifyUser(email: string, password: string) {
  const user = readDatabase().users.find((candidate) => candidate.email === email.toLowerCase())
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null
  return user
}

export function getUser(id: string) { return readDatabase().users.find((user) => user.id === id) ?? null }

export function saveInvestigation(investigation: Investigation) {
  const database = readDatabase()
  database.investigations.unshift(investigation)
  writeDatabase(database)
  return investigation
}

export function listInvestigations(userId: string) { return readDatabase().investigations.filter((item) => item.userId === userId) }

export function approveInvestigation(id: string, userId: string) {
  const database = readDatabase()
  const investigation = database.investigations.find((item) => item.id === id && item.userId === userId)
  if (!investigation) return null
  investigation.status = 'approved'
  investigation.approvedAt = new Date().toISOString()
  writeDatabase(database)
  return investigation
}
