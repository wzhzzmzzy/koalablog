import { all, batchImport, updateRefs } from './db/markdown'
import { login } from './form/login'
import { remove, save } from './form/markdown'
import { onboarding } from './form/onboarding'
import { settings } from './form/settings'
import { list, remove as removeResource, upload } from './oss/operate'

export const server = {
  oss: {
    upload,
    remove: removeResource,
    list,
  },
  form: {
    onboarding,
    login,
    remove,
    save,
    settings,
  },
  db: {
    markdown: {
      all,
      batchImport,
      updateRefs,
    },
  },
}
