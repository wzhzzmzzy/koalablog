import { all, batchImport, getNewMemoSubject, updateRefs } from './db/markdown'
import { login } from './form/login'
import { remove, save, setPrivate } from './form/markdown'
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
    setPrivate,
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
      getNewMemoSubject,
    },
  },
}
