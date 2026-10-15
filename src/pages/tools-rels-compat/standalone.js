import React from "react";
import Head from "@docusaurus/Head";

import BuilderToolsTree from "@site/src/components/BuilderToolsTree";

// The relationships and compatibility view on its own, without the portal's
// navbar, hero and footer: for full-window use or embedding.  Same component,
// same URL parameters as /tools-rels-compat/.
export default function ToolsRelsCompatStandalone() {
  return (
    <>
      <Head>
        <title>Builder Tools · Relationships & Compatibility</title>
        <meta name="description" content="Browse Cardano builder tools by their dependencies and era compatibility." />
      </Head>
      <main className="btt-standalone">
        <BuilderToolsTree />
      </main>
    </>
  );
}
