import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getAllBlogPosts, BLOG_CATEGORIES } from '@/lib/blogData';
import Link from 'next/link';
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
  const featured = posts[0];
  const rest = posts.slice(1);

  // Group rest by category for the section headers
  const categories = {};
  for (const post of rest) {
    if (!categories[post.category]) categories[post.category] = [];
    categories[post.category].push(post);
  }

  return (
    <>
      <Header />

      <main className="blog-index">
        {/* Masthead */}
        <div className="blog-masthead">
          <div className="container blog-masthead__inner">
            <p className="blog-masthead__label">Med Connect · Blog de salud</p>
            <h1 className="blog-masthead__title">
              Lo que nadie te explica<br />sobre la sanidad privada.
            </h1>
            <p className="blog-masthead__sub">
              Cuándo ir al especialista, qué esperar de tu seguro y cómo no perder semanas de tu vida esperando una cita.
            </p>
          </div>
        </div>

        <div className="container blog-index__body">
          {/* Featured article */}
          {featured && (
            <section className="blog-featured-section">
              <Link href={`/blog/${featured.slug}`} className="blog-featured-link">
                <div className="blog-featured-meta">
                  <span className="blog-category-pill">{BLOG_CATEGORIES[featured.category]}</span>
                  <span className="blog-meta-dot" aria-hidden="true">·</span>
                  <span className="blog-reading-time">{featured.readingMinutes} min</span>
                </div>
                <h2 className="blog-featured-title">{featured.title}</h2>
                <p className="blog-featured-desc">{featured.description}</p>
                <span className="blog-featured-cta">
                  Leer artículo <span aria-hidden="true">→</span>
                </span>
              </Link>
            </section>
          )}

          {/* Divider */}
          <div className="blog-section-divider" />

          {/* Article list */}
          <section className="blog-list-section">
            <ol className="blog-list">
              {rest.map((post) => (
                <li key={post.slug} className="blog-list-item">
                  <Link href={`/blog/${post.slug}`} className="blog-list-link">
                    <div className="blog-list-meta">
                      <span className="blog-category-pill">{BLOG_CATEGORIES[post.category]}</span>
                      <span className="blog-meta-dot" aria-hidden="true">·</span>
                      <time className="blog-list-date" dateTime={post.publishedAt}>
                        {formatDate(post.publishedAt)}
                      </time>
                      <span className="blog-meta-dot" aria-hidden="true">·</span>
                      <span className="blog-reading-time">{post.readingMinutes} min</span>
                    </div>
                    <h2 className="blog-list-title">{post.title}</h2>
                    <p className="blog-list-desc">{post.description}</p>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
