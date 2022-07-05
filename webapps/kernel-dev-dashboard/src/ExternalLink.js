const ExternalLink = ({ children, ...props }) => (
  <a rel="noreferrer" target="_blank" {...props} className="text-primary">{children}</a>
)

export default ExternalLink;
