import { all, batchImport, byPrefix, emptyTrash, getNewMemoTitle, purge, restore, trash } from './db/markdown'
import { login } from './form/login'
import { save, setPrivate } from './form/markdown'
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
    save,
    settings,
  },
  db: {
    markdown: {
      all,
      batchImport,
      byPrefix,
      getNewMemoTitle,
      trash,
      restore,
      purge,
      emptyTrash,
    },
  },
}
