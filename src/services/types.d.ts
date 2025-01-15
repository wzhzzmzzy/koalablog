export interface Post {
  title: string;
  article: Article;
}

export interface Page extends Post {
  footer?: string;
  customScript?: string;
  customStyle?: string;
}

export interface PageContent<T = never> {
  meta: Record<string, string> & T;
  content: string;
}

export interface PageMeta<T> {
  title: string;
  meta: PageContent<T>["meta"];
}

export type PageList = Array<PageMeta>;
