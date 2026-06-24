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
        {/* Masthead — editorial intro (replaces image hero) */}
        <section className="blog-masthead">
          <div className="container blog-masthead__inner">
            <p className="blog-masthead__label">Med Connect · Blog de salud</p>
            <h1 className="blog-masthead__title">
              Lo que nadie te explica<br />sobre la sanidad privada.
            </h1>
            <p className="blog-masthead__sub">
              Cuándo ir al especialista, qué esperar de tu seguro y cómo no perder semanas de tu vida esperando una cita.
            </p>
          </div>
        </section>

        <div className="container blog-index__body">
          {/* Featured article — banner horizontal */}
          {featured && (
            <section className="blog-banner-section">
              <Link href={`/blog/${featured.slug}`} className="blog-banner">
                <div className="blog-banner__image-wrap">
                  {featured.coverImage && (
                    <Image
                      src={featured.coverImage}
                      alt={featured.coverAlt || featured.title}
                      fill
                      sizes="280px"
                      className="blog-banner__img"
                      priority
                    />
                  )}
                </div>
                <div className="blog-banner__content">
                  <span className="blog-category-pill">{BLOG_CATEGORIES[featured.category]}</span>
                  <h2 className="blog-banner__title">{featured.title}</h2>
                  <p className="blog-banner__desc">{featured.description}</p>
                  <div className="blog-banner__meta">
                    <time dateTime={featured.publishedAt}>{formatDate(featured.publishedAt)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{featured.readingMinutes} min de lectura</span>
                  </div>
                </div>
              </Link>
            </section>
          )}

          {/* Card grid — all remaining articles */}
          {(second ? [second, ...rest] : rest).length > 0 && (
            <section className="blog-grid-section">
              <h2 className="blog-section-heading">Más artículos</h2>
              <div className="blog-card-grid">
                {(second ? [second, ...rest] : rest).map((post) => (
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
