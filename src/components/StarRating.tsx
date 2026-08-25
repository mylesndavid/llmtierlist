export default function StarRating({
  rating,
  size = "text-sm",
}: {
  rating: number;
  size?: string;
}) {
  return (
    <span className={`${size} leading-none text-amber-400`} aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(Math.round(rating))}
      <span className="text-edge">{"★".repeat(5 - Math.round(rating))}</span>
    </span>
  );
}
