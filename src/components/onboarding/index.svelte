<script lang="ts">
import { authClient } from '@/lib/utils/auth-client';
import z from 'zod'
import { ofetch } from 'ofetch';
import { to } from 'await-to-js';

const OnboardingSchema = z.object({
  blogTitle: z.string().min(1, 'Blog title cannot be empty').max(100, 'Blog title cannot exceed 100 characters'),
  adminKey: z.string().min(6, 'Admin key must be at least 6 characters').max(256, 'Admin key cannot exceed 256 characters'),
  adminEmail: z.string().email('Please enter a valid email address'),
})

let validationErrors: {
  blogTitle?: string[]
  adminKey?: string[]
  adminEmail?: string[]
} = $state({})

const formData = $state({
  blogTitle: '',
  adminKey: '',
  adminEmail: '',
})

const handleSubmit = async (e: Event) => {
  e.preventDefault()
  const result = OnboardingSchema.safeParse(formData)
  if (!result.success) {
    validationErrors = result.error.formErrors.fieldErrors
    return
  }

  const { error } = await authClient.signUp.email({
    email: formData.adminEmail,
    password: formData.adminKey,
    name: `${formData.blogTitle}Admin`,
  })

  if (error) {
    console.warn(error)
    return
  }
  
  const [res, configErr] = await to(ofetch('/api/config/onboarding', {
    method: 'POST',
    body: JSON.stringify(formData),
  }))
  
  if (configErr) {
    console.warn(configErr)
    return
  }
  
  window.location.pathname = '/dashboard'
}
</script>

<form class="max-w-md mx-auto mt-10">
  <div class="mb-6">
    <label for="blogTitle" class="block mb-2 text-sm font-medium text-gray-900">Blog Title:</label>
    <input
      type="text"
      id="blogTitle"
      name="blogTitle"
      class={`bg-gray-50 border ${
        validationErrors.blogTitle ? 'border-red-500' : 'border-gray-300'
      } text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5`}
      placeholder="Input your blog title"
      required
    />
    {#if validationErrors.blogTitle}
      <p class="mt-2 text-sm text-red-600">{validationErrors.blogTitle?.join(';')}</p>
    {/if}
  </div>

  <div class="mb-6">
    <label for="adminKey" class="block mb-2 text-sm font-medium text-gray-900">Admin Key:</label>
    <input
      type="password"
      id="adminKey"
      name="adminKey"
      class={`bg-gray-50 border ${
        validationErrors.adminKey ? 'border-red-500' : 'border-gray-300'
      } text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5`}
      placeholder="Set your admin key"
      required
    />
    {#if validationErrors.adminKey}
      <p class="mt-2 text-sm text-red-600">{validationErrors.adminKey?.join(';')}</p>
    {/if}
  </div>

  <div class="mb-6">
    <label for="adminEmail" class="block mb-2 text-sm font-medium text-gray-900">Admin Email (for recovery):</label>
    <input
      type="email"
      id="adminEmail"
      name="adminEmail"
      class={`bg-gray-50 border ${
        validationErrors.adminEmail ? 'border-red-500' : 'border-gray-300'
      } text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5`}
      placeholder="Enter your email for recovery"
      required
    />
    {#if validationErrors.adminEmail}
      <p class="mt-2 text-sm text-red-600">{validationErrors.adminEmail?.join(';')}</p>
    {/if}
  </div>

  <button
    type="submit"
    class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm w-full px-5 py-2.5 text-center"
    onclick={handleSubmit}
  >
    Submit
  </button>
</form>
