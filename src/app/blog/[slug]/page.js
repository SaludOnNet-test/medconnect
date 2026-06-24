import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BlogCTA from '@/components/BlogCTA';
import { getBlogPost, getAllBlogSlugs, BLOG_CATEGORIES } from '@/lib/blogData';
import { SPECIALTY_MAP, CITY_MAP, specialtyPageUrl } from '@/lib/seoData';
import Link from 'next/link';
import '../blog.css';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';

export async function generateStaticParams() {
  return getAllBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};

  const url = `${BASE_URL}/blog/${post.slug}`;
  return {
    title: `${post.title} — Med Connect`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      url,
      title: post.title,
      description: post.description,
      publishedTime: post.publishedAt,
      siteName: 'Med Connect',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

function buildArticleSchema(post) {
  const url = `${BASE_URL}/blog/${post.slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': url,
        headline: post.title,
        description: post.description,
        url,
        datePublished: post.publishedAt,
        dateModified: post.publishedAt,
        publisher: {
          '@type': 'Organization',
          name: 'Med Connect',
          url: BASE_URL,
        },
        inLanguage: 'es-ES',
        about: post.relatedSpecialty
          ? {
              '@type': 'MedicalSpecialty',
              name: SPECIALTY_MAP[post.relatedSpecialty]?.name || post.relatedSpecialty,
            }
          : undefined,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: BASE_URL },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${BASE_URL}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      },
    ],
  };
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function RelatedSpecialtyBox({ specialtySlug, articleSlug }) {
  if (!specialtySlug || !SPECIALTY_MAP[specialtySlug]) return null;
  const specialty = SPECIALTY_MAP[specialtySlug];
  const cities = Object.values(CITY_MAP).slice(0, 4);

  return (
    <aside className="blog-related-specialty">
      <p className="blog-related-specialty__label">Buscar cita de {specialty.name}</p>
      <p className="blog-related-specialty__desc">
        Consigue cita con {specialty.plural.toLowerCase()} privados esta semana en tu ciudad.
      </p>
      <div className="blog-related-specialty__cities">
        {cities.map((city) => (
          <Link
            key={city.slug}
            href={specialtyPageUrl(specialtySlug, city.slug)}
            className="blog-related-specialty__city-link"
          >
            {city.name}
          </Link>
        ))}
      </div>
      <BlogCTA
        articleSlug={articleSlug}
        specialtySlug={specialtySlug}
        specialtyName={specialty.name}
        label={`Buscar cita de ${specialty.name}`}
        size="md"
      />
    </aside>
  );
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const articleSchema = buildArticleSchema(post);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <Header />

      <main className="blog-post">
        <div className="container blog-post__container">
          <nav className="blog-post__breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Inicio</Link>
            <span aria-hidden="true"> / </span>
            <Link href="/blog">Blog</Link>
            <span aria-hidden="true"> / </span>
            <span>{BLOG_CATEGORIES[post.category] || post.category}</span>
          </nav>

          <header className="blog-post__header">
            <span className="blog-category-pill">{BLOG_CATEGORIES[post.category]}</span>
            <h1 className="blog-post__title">{post.title}</h1>
            <p className="blog-post__description">{post.description}</p>
            <div className="blog-post__byline">
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
              <span>·</span>
              <span>{post.readingMinutes} min de lectura</span>
            </div>
          </header>

          <div className="blog-post__body">
            <div
              className="blog-post__content prose"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            <aside className="blog-post__sidebar">
              <RelatedSpecialtyBox
                specialtySlug={post.relatedSpecialty}
                articleSlug={post.slug}
              />

              <div className="blog-cta-box">
                <p className="blog-cta-box__title">¿Necesitas cita urgente?</p>
                <p className="blog-cta-box__desc">
                  Accede a plazas prioritarias en clínicas privadas con tu seguro. Cita en 24–72 h.
                </p>
                <BlogCTA
                  articleSlug={post.slug}
                  specialtySlug={post.relatedSpecialty}
                  specialtyName={post.relatedSpecialty ? SPECIALTY_MAP[post.relatedSpecialty]?.name : null}
                  label="Buscar mi especialista"
                  size="md"
                />
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
