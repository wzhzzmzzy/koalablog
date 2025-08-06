import { login } from './form/login'
import { remove, save } from './form/markdown'
import { onboarding } from './form/onboarding'
import { settings } from './form/settings'

export const server = {
  form: {
    onboarding,
    login,
    remove,
    save,
    settings,
  },
}
