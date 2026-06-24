import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHeader from '@/components/brand/PageHeader';
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

function CategoryPill({ category }) {
  return (
    <span className="blog-category-pill">
      {BLOG_CATEGORIES[category] || category}
    </span>
  );
}

function BlogCard({ post }) {
  return (
    <article className="blog-card">
      <Link href={`/blog/${post.slug}`} className="blog-card__link">
        <div className="blog-card__meta">
          <CategoryPill category={post.category} />
          <span className="blog-card__reading-time">{post.readingMinutes} min de lectura</span>
        </div>
        <h2 className="blog-card__title">{post.title}</h2>
        <p className="blog-card__description">{post.description}</p>
        <time className="blog-card__date" dateTime={post.publishedAt}>
          {formatDate(post.publishedAt)}
        </time>
      </Link>
    </article>
  );
}

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();
  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <>
      <Header />
      <PageHeader
        eyebrow="Blog de salud"
        title={<>Guías para navegar la <em>medicina privada</em> sin perder tiempo ni dinero.</>}
        lede="Información práctica sobre cuándo ir al especialista, qué esperar de cada consulta y cómo acceder a tu cita cuando la necesitas."
      />

      <section className="blog-section">
        <div className="container blog-container">
          {featured && (
            <div className="blog-featured">
              <article className="blog-card blog-card--featured">
                <Link href={`/blog/${featured.slug}`} className="blog-card__link">
                  <div className="blog-card__meta">
                    <CategoryPill category={featured.category} />
                    <span className="blog-card__reading-time">{featured.readingMinutes} min de lectura</span>
                  </div>
                  <h2 className="blog-card__title blog-card__title--featured">{featured.title}</h2>
                  <p className="blog-card__description">{featured.description}</p>
                  <time className="blog-card__date" dateTime={featured.publishedAt}>
                    {formatDate(featured.publishedAt)}
                  </time>
                </Link>
              </article>
            </div>
          )}

          <div className="blog-grid">
            {rest.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
