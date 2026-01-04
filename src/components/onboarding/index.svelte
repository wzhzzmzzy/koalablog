<script lang="ts">
import { actions } from 'astro:actions';
import { navigate } from 'astro:transitions/client';

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
    />
    {#if validationErrors.adminKey}
      <p class="mt-2 text-sm text-red-600">{validationErrors.adminKey?.join(';')}</p>
    {/if}
  </div>

  <button
    type="submit"
    class="outline-none font-medium text-center cursor-pointer btn"
  >
    Submit
  </button>
</form>
