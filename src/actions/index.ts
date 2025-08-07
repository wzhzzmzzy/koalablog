import { login } from './form/login'
import { remove, save } from './form/markdown'
import { onboarding } from './form/onboarding'
import { settings } from './form/settings'
import { remove as removeResource, upload } from './oss/operate'

export const server = {
  oss: {
    upload,
    remove: removeResource,
  },
  form: {
    onboarding,
    login,
    remove,
    save,
    settings,
  },
}
