import { all, batchImport, byPrefix, create, emptyTrash, purge, restore, trash } from './db/markdown'
import { read as readTemplates, replace as replaceTemplates } from './db/templates'
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
    templates: {
      read: readTemplates,
      replace: replaceTemplates,
    },
    markdown: {
      all,
      batchImport,
      byPrefix,
      create,
      trash,
      restore,
      purge,
      emptyTrash,
    },
  },
}
