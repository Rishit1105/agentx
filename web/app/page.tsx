import Link from "next/link";

export default function Landing() {
  return (
    <main className="h-dvh grid place-items-center">
      <Link href="/deck" className="btn btn-primary">Open the desk</Link>
    </main>
  );
}
