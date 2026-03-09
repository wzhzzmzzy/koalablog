import { uploadFile } from '@/lib/services/file-reader'
import { attachment } from '@cartamd/plugin-attachment'
import { code } from '@cartamd/plugin-code'
import { emoji } from '@cartamd/plugin-emoji'
import { slash } from '@cartamd/plugin-slash'
import { Carta } from 'carta-md'
import remarkGfm from 'remark-gfm'
import wikiLink from 'remark-wiki-link'

export class CartaStore {
  carta = $state<Carta | null>(null)

  init() {
    if (this.carta)
      return

    this.carta = new Carta({
      sanitizer: false,
      extensions: [
        {
          remarkPlugins: [
            remarkGfm,
            [wikiLink, {
              hrefTemplate: (permalink: string) => `/${permalink}`,
              aliasDivider: '|',
              pageResolver: (name: string) => [name.replace(/ /g, '-').toLowerCase()],
              wikiLinkClassName: 'outgoing-link',
              newClassName: 'outgoing-link new',
            }],
          ],
        } as any,
        attachment({
          async upload(file) {
            const { data, error } = await uploadFile('article', file)
            if (error) {
              throw new Error(error.message)
            }
            return `/api/oss/${data!.replace('/', '_')}`
          },
        }),
        code(),
        emoji(),
        slash(),
      ],
    })
  }
}

export const cartaStore = new CartaStore()
