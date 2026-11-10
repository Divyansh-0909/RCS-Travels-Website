const BrandWordmark = ({ as: Tag = "span", size = "text-2xl", strongClassName = "font-semibold", className = "", ...props }) => (
    <Tag {...props} className={`rcs-wordmark whitespace-nowrap ${size} font-normal ${className}`}>
        <span className={strongClassName}>RCS</span> travels
    </Tag>
);

export default BrandWordmark;
