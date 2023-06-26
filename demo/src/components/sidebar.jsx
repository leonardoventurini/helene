import { Link } from 'react-router-dom'

export function Sidebar() {
  return (
    <ul className='menu w-56'>
      <li>
        <Link to='/'>Introduction</Link>
      </li>
      <li>
        <Link to='/server'>Server</Link>
      </li>
      <li>
        <Link to='/client'>Client</Link>
      </li>
      <li>
        <Link to='/methods'>Methods</Link>
        <ul>
          <li>
            <a>level 2 item 1</a>
          </li>
          <li>
            <a>Parent</a>
            <ul>
              <li>
                <a>level 3 item 2</a>
              </li>
            </ul>
          </li>
        </ul>
      </li>
      <li>
        <Link to='/events'>Events</Link>
        <ul>
          <li>
            <a>level 2 item 1</a>
          </li>
          <li>
            <a>Parent</a>
            <ul>
              <li>
                <a>level 3 item 2</a>
              </li>
            </ul>
          </li>
        </ul>
      </li>
      <li>
        <Link to='/data'>Data</Link>
      </li>
      <li>
        <Link to='/react'>React</Link>
      </li>
    </ul>
  )
}
