import styles from './PlaceholderPage.module.css';

interface PlaceholderPageProps {
  icon: string;
  title: string;
  description?: string;
}

export default function PlaceholderPage({ icon, title, description }: PlaceholderPageProps) {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <span className={styles.icon}>{icon}</span>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.description}>{description || 'Coming Soon...'}</p>
      </div>
    </div>
  );
}
