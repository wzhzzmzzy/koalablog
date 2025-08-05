<script lang="ts">
import z from 'zod'
import { ofetch } from 'ofetch';
import { to } from 'await-to-js';

const OnboardingSchema = z.object({
  blogTitle: z.string().min(1, 'Blog title cannot be empty').max(100, 'Blog title cannot exceed 100 characters'),
  adminKey: z.string().min(6, 'Admin key must be at least 6 characters').max(256, 'Admin key cannot exceed 256 characters'),
})

let validationErrors: {
  blogTitle?: string[]
  adminKey?: string[]
} = $state({})

const formData = $state({
  blogTitle: '',
  adminKey: '',
  serverFail: ''
})

const handleSubmit = async (e: Event) => {
  e.preventDefault()
  const result = OnboardingSchema.safeParse(formData)
  if (!result.success) {
    validationErrors = result.error.formErrors.fieldErrors
    return
  }

  const [configError, res] = await to(ofetch('/api/config/onboarding', {
    method: 'POST',
    body: JSON.stringify(formData),
  }))
  
  if (configError) {
    console.warn('config', configError)
    formData.serverFail = configError.message
    return
  }
  
  setTimeout(() => {
    window.location.pathname = '/dashboard'
  }, 1000)
}
</script>

<div>
  {#if formData.serverFail}
    <div class="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50" role="alert">
      {formData.serverFail}
    </div>
  {/if}
</div>
<form method="POST" class="mt-10" onsubmit={handleSubmit}>
  <div class="mb-6">
    <label for="blogTitle" class="block mb-2 text-sm font-medium">Blog Title:</label>
    <input
      type="text"
      id="blogTitle"
      name="blogTitle"
      bind:value={formData.blogTitle}
      class={`outline-none border-none ${
        validationErrors.blogTitle ? 'border-red-500' : 'border-gray-300'
      } text-sm block h-10 w-full bg-[--koala-code-bg] color-[--koala-code-text] pl-2`}
      placeholder="Set your blog title"
      required
    />
    {#if validationErrors.blogTitle}
      <p class="mt-2 text-sm text-red-600">{validationErrors.blogTitle?.join(';')}</p>
    {/if}
  </div>

  <div class="mb-6">
    <label for="adminKey" class="block mb-2 text-sm font-medium">Admin Key:</label>
    <input
      type="password"
      id="adminKey"
      name="adminKey"
      bind:value={formData.adminKey}
      class={`outline-none border-none ${
        validationErrors.adminKey ? 'border-red-500' : 'border-gray-300'
      } text-sm block h-10 w-full bg-[--koala-code-bg] color-[--koala-code-text] pl-2`}
      placeholder="Do not forget it"
      required
    />
    {#if validationErrors.adminKey}
      <p class="mt-2 text-sm text-red-600">{validationErrors.adminKey?.join(';')}</p>
    {/if}
  </div>

  <button
    type="submit"
    class="outline-none font-medium text-center cursor-pointer"
  >
    Submit
  </button>
</form>
