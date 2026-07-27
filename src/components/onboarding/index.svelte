<script lang="ts">
import { actions } from 'astro:actions';
import { navigate } from 'astro:transitions/client';

let validationErrors: {
  blogTitle?: string[]
  username?: string[]
  password?: string[]
} = $state({})

const formData = $state({
  blogTitle: '',
  username: '',
  password: '',
  serverFail: ''
})

const handleSubmit = async (e: Event) => {
  e.preventDefault()

  const { error } = await actions.form.onboarding(formData)

  if (error) {
    if ((error as any).fields) {
      validationErrors = (error as any).fields
    } else {
      formData.serverFail = error.message
    }
    return
  }

  navigate('/dashboard')

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
    />
    {#if validationErrors.blogTitle}
      <p class="mt-2 text-sm text-red-600">{validationErrors.blogTitle?.join(';')}</p>
    {/if}
  </div>

  <div class="mb-6">
    <label for="username" class="block mb-2 text-sm font-medium">Username:</label>
    <input
      type="text"
      id="username"
      name="username"
      bind:value={formData.username}
      class={`outline-none border-none ${
        validationErrors.username ? 'border-red-500' : 'border-gray-300'
      } text-sm block h-10 w-full bg-[--koala-code-bg] color-[--koala-code-text] pl-2`}
      placeholder="Your admin username"
    />
    {#if validationErrors.username}
      <p class="mt-2 text-sm text-red-600">{validationErrors.username?.join(';')}</p>
    {/if}
  </div>

  <div class="mb-6">
    <label for="password" class="block mb-2 text-sm font-medium">Password:</label>
    <input
      type="password"
      id="password"
      name="password"
      bind:value={formData.password}
      class={`outline-none border-none ${
        validationErrors.password ? 'border-red-500' : 'border-gray-300'
      } text-sm block h-10 w-full bg-[--koala-code-bg] color-[--koala-code-text] pl-2`}
      placeholder="Do not forget it"
    />
    {#if validationErrors.password}
      <p class="mt-2 text-sm text-red-600">{validationErrors.password?.join(';')}</p>
    {/if}
  </div>

  <button
    type="submit"
    class="outline-none font-medium text-center cursor-pointer btn"
  >
    Submit
  </button>
</form>
