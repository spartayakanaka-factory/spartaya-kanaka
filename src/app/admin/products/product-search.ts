import { Prisma } from "@/generated/prisma/client";

export function catalogLikePattern(q: string) {
  // MariaDB prepared parameters can use a binary collation even when the
  // connection and product columns use unicode_ci. Pin both operands to
  // the catalog collation and treat percent and underscore as literal text.
  const escaped = q.replace(/[!%_]/g, (character) => "!" + character);
  return Prisma.sql`CONVERT(${"%" + escaped + "%"} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
}

export function productSearchWhere({
  q,
  category,
  status,
  type,
  excludeArchived,
}: {
  q: string;
  category: string;
  status?: string;
  type?: string;
  excludeArchived?: boolean;
}) {
  const pattern = catalogLikePattern(q);
  const predicates = [
    Prisma.sql`(
      p.titleAr COLLATE utf8mb4_unicode_ci LIKE ${pattern} ESCAPE '!' OR
      p.titleEn COLLATE utf8mb4_unicode_ci LIKE ${pattern} ESCAPE '!' OR
      p.slug COLLATE utf8mb4_unicode_ci LIKE ${pattern} ESCAPE '!'
    )`,
  ];
  if (excludeArchived) predicates.push(Prisma.sql`p.status <> 'ARCHIVED'`);
  if (status) predicates.push(Prisma.sql`p.status = ${status}`);
  if (type) predicates.push(Prisma.sql`p.type = ${type}`);
  if (category) {
    predicates.push(Prisma.sql`EXISTS (
      SELECT 1 FROM product_categories pc WHERE pc.productId = p.id AND pc.categoryId = ${category}
    )`);
  }
  return Prisma.join(predicates, " AND ");
}
