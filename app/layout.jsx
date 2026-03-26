import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

export const metadata = {
  title: {
    default: 'AllTheBacteria',
    template: '%s | AllTheBacteria'
  },
  description:
    'All bacterial isolate whole-genome sequencing data from INSDC, up to August 2024, uniformly assembled, quality-controlled, annotated, and searchable.'
}

const navbar = (
  <Navbar
    logo={<strong>AllTheBacteria</strong>}
    projectLink="https://github.com/AllTheBacteria/AllTheBacteria"
  />
)

const footer = (
  <Footer>
    AllTheBacteria consortium {new Date().getFullYear()} © AllTheBacteria.
  </Footer>
)

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/AllTheBacteria/AllTheBacteria/tree/main/content"
          sidebar={{ defaultMenuCollapseLevel: 1, autoCollapse: true }}
          editLink="Edit this page on GitHub"
          feedback={{ content: 'Question? Give us feedback', labels: 'feedback' }}
          toc={{ backToTop: true }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
