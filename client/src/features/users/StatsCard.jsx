function StatsCard({ title, number, description, IconComponent, iconColor }) {
  return (
    <div className="rounded-lg shadow-lg p-6 border border-gray-800 transform hover:scale-105 transition-all bg-gray-900">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-gray-300 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold mt-2 text-white">{number}</p>
          <p className="text-gray-400 text-sm mt-1">{description}</p>
        </div>

        {/* Icon */}
        <div className="p-3 rounded-lg flex items-center justify-center bg-gray-800">
          <IconComponent size={24} className={iconColor} />
        </div>
      </div>
    </div>
  );
}

export default StatsCard;