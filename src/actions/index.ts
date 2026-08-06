import { all, batchImport, byPrefix, create, emptyTrash, purge, restore, trash } from './db/markdown'
import { attach as attachRenderArtifact, status as renderArtifactStatus } from './db/render-artifact'
import { read as readTemplates, replace as replaceTemplates } from './db/templates'
import { changePassword, createApiToken, createUser, resetPassword, revokeApiToken } from './form/account'
import { login, logout } from './form/login'
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
    logout,
    save,
    settings,
    changePassword,
    createApiToken,
    revokeApiToken,
    createUser,
    resetPassword,
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
    renderArtifact: {
      attach: attachRenderArtifact,
      status: renderArtifactStatus,
    },
  },
}
