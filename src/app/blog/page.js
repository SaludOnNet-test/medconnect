import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getAllBlogPosts, BLOG_CATEGORIES } from '@/lib/blogData';
import Link from 'next/link';
import Image from 'next/image';
import './blog.css';

export const metadata = {
  title: 'Blog de salud — Med Connect',
  description: 'Guías prácticas sobre especialistas médicos, síntomas que no deben esperar y cómo acceder a la medicina privada sin perder tiempo ni dinero.',
  alternates: { canonical: '/blog' },
};

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();
  const [featured, second, ...rest] = posts;

  return (
    <>
      <Header />

      <main className="blog-index">
        {/* Hero — featured article */}
        {featured && (
          <section className="blog-hero">
            <Link href={`/blog/${featured.slug}`} className="blog-hero__link">
              <div className="blog-hero__image-wrap">
                {featured.coverImage && (
                  <Image
                    src={featured.coverImage}
                    alt={featured.coverAlt || featured.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 70vw"
                    className="blog-hero__img"
                    priority
                  />
                )}
                <div className="blog-hero__overlay" />
              </div>
              <div className="blog-hero__content">
                <span className="blog-category-pill blog-category-pill--light">
                  {BLOG_CATEGORIES[featured.category]}
                </span>
                <h1 className="blog-hero__title">{featured.title}</h1>
                <p className="blog-hero__desc">{featured.description}</p>
                <div className="blog-hero__meta">
                  <time dateTime={featured.publishedAt}>{formatDate(featured.publishedAt)}</time>
                  <span aria-hidden="true">·</span>
                  <span>{featured.readingMinutes} min de lectura</span>
                </div>
              </div>
            </Link>
          </section>
        )}

        <div className="container blog-index__body">
          {/* Second article — horizontal banner */}
          {second && (
            <section className="blog-banner-section">
              <Link href={`/blog/${second.slug}`} className="blog-banner">
                <div className="blog-banner__image-wrap">
                  {second.coverImage && (
                    <Image
                      src={second.coverImage}
                      alt={second.coverAlt || second.title}
                      fill
                      sizes="280px"
                      className="blog-banner__img"
                    />
                  )}
                </div>
                <div className="blog-banner__content">
                  <span className="blog-category-pill">{BLOG_CATEGORIES[second.category]}</span>
                  <h2 className="blog-banner__title">{second.title}</h2>
                  <p className="blog-banner__desc">{second.description}</p>
                  <div className="blog-banner__meta">
                    <time dateTime={second.publishedAt}>{formatDate(second.publishedAt)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{second.readingMinutes} min</span>
                  </div>
                </div>
              </Link>
            </section>
          )}

          {/* Grid of remaining articles */}
          {rest.length > 0 && (
            <section className="blog-grid-section">
              <h2 className="blog-section-heading">Más artículos</h2>
              <div className="blog-card-grid">
                {rest.map((post) => (
                  <Link key={post.slug} href={`/blog/${post.slug}`} className="blog-card">
                    <div className="blog-card__image-wrap">
                      {post.coverImage ? (
                        <Image
                          src={post.coverImage}
                          alt={post.coverAlt || post.title}
                          fill
                          sizes="(max-width: 600px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="blog-card__img"
                        />
                      ) : (
                        <div className="blog-card__placeholder" aria-hidden="true" />
                      )}
                    </div>
                    <div className="blog-card__body">
                      <span className="blog-category-pill">{BLOG_CATEGORIES[post.category]}</span>
                      <h3 className="blog-card__title">{post.title}</h3>
                      <p className="blog-card__desc">{post.description}</p>
                      <div className="blog-card__meta">
                        <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                        <span aria-hidden="true">·</span>
                        <span>{post.readingMinutes} min</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
