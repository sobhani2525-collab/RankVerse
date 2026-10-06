import { permanentRedirect } from "next/navigation";

// People pages live at /person/{slug}; /people/{slug} is the natural guess
// (the list is at /people), so send it there instead of showing a 404.
export default async function PeopleSlugRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/person/${slug}`);
}
