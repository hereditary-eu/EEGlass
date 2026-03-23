import "../../css/components/Layout/Footer.css";

const rootClass = "cif-footer";
const styles = {
  footer: "footer",
  link: "link",
} as const;

const Footer: React.FC = () => {
  return (
    <footer className={`${rootClass} ${styles.footer}`}>
      Uicons by{" "}
      <a className={styles.link} href="https://www.flaticon.com/uicons">
        Flaticon
      </a>
    </footer>
  );
};

export default Footer;
