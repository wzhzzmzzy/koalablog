import { createAuth } from './auth'

// for better-auth cli
export const auth = createAuth({
  type: 'sqlite',
})
