import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import clsx from "clsx";

import SiteHero from "@site/src/components/Layout/SiteHero";
import PageCTA from "@site/src/components/PageCTA";
import BuilderToolsTree from "@site/src/components/BuilderToolsTree";

import styles from "@site/src/pages/tools/styles.module.css";

const TITLE = "Builder Tools";
const HERO_DESCRIPTION =
  "Discover developer tools, SDKs, and libraries for building on Cardano. Smart contracts, transactions, indexing, wallets, and more.";

export default function ToolsRelsCompat() {
  return (
    <Layout
      title="Tools · Relationships & Compatibility"
      description="Browse Cardano builder tools by their dependencies and era compatibility."
    >
      <SiteHero title={TITLE} description={HERO_DESCRIPTION} />

      <section className={clsx("container", styles.section)}>
        <nav className={styles.breadcrumb} aria-label="breadcrumb">
          <Link to="/tools">Builder Tools</Link>
          <span className={styles.crumbSep} aria-hidden>/</span>
          <span className={styles.crumbCurrent}>Relationships and compatibility</span>
        </nav>

        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            Browse tools by relationships and compatibility
          </h2>
          <span className={styles.sectionSubtitle}>
            Slicing and dicing the Cardano stack
          </span>
        </header>
        <BuilderToolsTree />
      </section>

      <PageCTA
        title="Built a tool for Cardano?"
        description="Add it to this page. The submission process is open and lightweight."
        href="/docs/contribute/portal-contribute"
        buttonText="Add your tool"
        variant="primary"
      />
    </Layout>
  );
}
