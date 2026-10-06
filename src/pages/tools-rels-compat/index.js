import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import clsx from "clsx";

import SiteHero from "@site/src/components/SiteHero";
import PageCTA from "@site/src/components/PageCTA";
import BuilderToolsTree from "@site/src/components/BuilderToolsTree";

import styles from "@site/src/pages/tools/styles.module.css";

const TITLE = "Builder Tools";
const HERO_DESCRIPTION = "Every tool for you to build with Cardano.";

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
        buttons={[
          { href: "/docs/contribute/portal-contribute", label: "Add your tool" },
        ]}
      />
    </Layout>
  );
}
