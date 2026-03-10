import { all, batchImport, getNewMemoSubject, updateRefs } from './db/markdown'
import { generateBearerToken, revokeBearerToken } from './db/token'
import { login } from './form/login'
import { remove, save, setPrivate } from './form/markdown'
import { onboarding } from './form/onboarding'
import { settings } from './form/settings'
import { list, remove as removeResource, upload } from './oss/operate'

export const actions = {
  oss: {
    upload,
    remove: removeResource,
    list,
  },
  form: {
    setPrivate,
    onboarding,
    login,
    remove,
    save,
    settings,
  },
  db: {
    auth: {
      generateBearerToken,
      revokeBearerToken,
    },
    markdown: {
      all,
      batchImport,
      updateRefs,
      getNewMemoSubject,
    },
  },
}
